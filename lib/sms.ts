import 'server-only'
import { createHmac, createPublicKey, timingSafeEqual, verify } from 'crypto'

// Sending and receiving texts through Twilio or Telnyx (whichever is set up
// in Vercel - see docs/SETUP.md).
//
// Twilio:  TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER
//          (or TWILIO_MESSAGING_SERVICE_SID)
// Telnyx:  TELNYX_API_KEY, TELNYX_FROM_NUMBER, TELNYX_PUBLIC_KEY
//          (optional: TELNYX_MESSAGING_PROFILE_ID)
// SMS_PROVIDER=twilio or SMS_PROVIDER=telnyx picks one if both are set.

export type SmsProvider = 'twilio' | 'telnyx'

export function smsProvider(): SmsProvider | null {
  const forced = (process.env.SMS_PROVIDER || '').toLowerCase()
  const twilio = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && (process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_MESSAGING_SERVICE_SID))
  const telnyx = !!(process.env.TELNYX_API_KEY && process.env.TELNYX_FROM_NUMBER)
  if (forced === 'twilio') return twilio ? 'twilio' : null
  if (forced === 'telnyx') return telnyx ? 'telnyx' : null
  return twilio ? 'twilio' : telnyx ? 'telnyx' : null
}

export class SmsNotSetUpError extends Error {
  constructor() {
    super('Texting is not set up yet - add your Twilio or Telnyx settings in Vercel (see docs/SETUP.md).')
  }
}

export async function sendSms(to: string, body: string): Promise<{ provider: SmsProvider; id: string | null; status: string | null }> {
  const provider = smsProvider()
  if (!provider) throw new SmsNotSetUpError()

  if (provider === 'twilio') {
    const sid = process.env.TWILIO_ACCOUNT_SID!
    const form = new URLSearchParams({ To: to, Body: body })
    if (process.env.TWILIO_MESSAGING_SERVICE_SID) form.set('MessagingServiceSid', process.env.TWILIO_MESSAGING_SERVICE_SID)
    else form.set('From', process.env.TWILIO_FROM_NUMBER!)
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(`Twilio: ${data?.message ?? `HTTP ${res.status}`}`)
    return { provider, id: data?.sid ?? null, status: data?.status ?? null }
  }

  const res = await fetch('https://api.telnyx.com/v2/messages', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.TELNYX_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.TELNYX_FROM_NUMBER,
      to,
      text: body,
      ...(process.env.TELNYX_MESSAGING_PROFILE_ID ? { messaging_profile_id: process.env.TELNYX_MESSAGING_PROFILE_ID } : {}),
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`Telnyx: ${data?.errors?.[0]?.detail ?? data?.errors?.[0]?.title ?? `HTTP ${res.status}`}`)
  return { provider, id: data?.data?.id ?? null, status: data?.data?.to?.[0]?.status ?? null }
}

/** Twilio signs each webhook with your Auth Token: checks it really came from Twilio */
export function twilioSignatureOk(url: string, params: Record<string, string>, signature: string | null): boolean {
  const token = process.env.TWILIO_AUTH_TOKEN
  if (!token || !signature) return false
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join('')
  const expected = Buffer.from(createHmac('sha1', token).update(data, 'utf8').digest('base64'))
  const given = Buffer.from(signature)
  return expected.length === given.length && timingSafeEqual(expected, given)
}

/** Telnyx signs each webhook (ed25519) - checked with TELNYX_PUBLIC_KEY from the Telnyx portal */
export function telnyxSignatureOk(rawBody: string, signature: string | null, timestamp: string | null): boolean {
  const pub = process.env.TELNYX_PUBLIC_KEY
  if (!pub || !signature || !timestamp) return false
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false
  try {
    const raw = Buffer.from(pub, 'base64')
    const key = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), raw]), format: 'der', type: 'spki' })
    return verify(null, Buffer.from(`${timestamp}|${rawBody}`), key, Buffer.from(signature, 'base64'))
  } catch {
    return false
  }
}

/** Words that mean "stop texting me" / "start again" / "help" (carriers require these) */
export function keywordOf(body: string): 'stop' | 'start' | 'help' | null {
  const w = body.trim().toLowerCase().replace(/[^a-z ]/g, '').trim()
  if (['stop', 'stopall', 'stop all', 'unsubscribe', 'cancel', 'end', 'quit', 'optout', 'opt out', 'revoke'].includes(w)) return 'stop'
  if (['start', 'unstop', 'yes start', 'resume'].includes(w)) return 'start'
  if (w === 'help' || w === 'info') return 'help'
  return null
}
