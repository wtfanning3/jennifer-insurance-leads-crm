import 'server-only'
import type Anthropic from '@anthropic-ai/sdk'
import { askClaude } from './ai'
import { LEAD_TYPE_LABELS, leadSummaryLines, type InsuranceLead } from './fields'
import { formatPhone } from './phone'
import { callLink, officePhoneFor, type Settings } from './settings'

export interface SmsRow {
  direction: 'in' | 'out'
  sender: string
  body: string
  created_at: string
}

export interface BotDecision {
  /** The text to send back (empty = don't reply) */
  reply: string
  /** A person should take over (the bot pauses itself for this lead) */
  handoff: boolean
  /** One line for the staff email, e.g. "Wants a call after 5pm" */
  note: string
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reply', 'handoff', 'note'],
  properties: {
    reply: { type: 'string', description: 'The text message to send. Empty string if no reply should be sent.' },
    handoff: { type: 'boolean', description: 'True when a licensed agent needs to take over.' },
    note: { type: 'string', description: 'One short line for the agent about what the lead wants.' },
  },
} as const

function systemPrompt(lead: InsuranceLead, s: Settings): string {
  const office = officePhoneFor(lead, s)
  return [
    `You answer text messages for ${s.agency_name || 'an insurance agency'}${s.office_address ? ` (${s.office_address})` : ''}, a Farmers Insurance agency${s.agent_name ? `; the agent is ${s.agent_name}` : ''}.`,
    `This person asked for a ${LEAD_TYPE_LABELS[lead.lead_type].toLowerCase()} insurance quote through SmartFinancial and got a text from us. You are replying to their texts.`,
    '',
    'Your goals, in order: be helpful and friendly; answer simple questions; gather anything still missing for the quote; and get them on the phone with the agent (that is where quotes are finished).',
    '',
    'Rules:',
    '- Write like a real person texting: 1 to 3 short sentences, under 300 characters. No emojis unless they use them. No markdown, no lists.',
    '- Never give a price, rate, premium estimate or discount amount, never say coverage is bound, approved or guaranteed, and never say they qualify for anything. Say the agent will go over exact numbers.',
    '- Never ask for or accept Social Security numbers, full driver license numbers, bank or card details by text. If they send them, tell them not to and that the agent will collect what is needed securely.',
    '- If asked whether you are a person or a bot, say you are the agency\'s virtual assistant and a licensed agent will follow up personally.',
    `- To reach the office, give this tap-to-call link: ${callLink(lead)}${office ? ` (office number ${formatPhone(office)})` : ''}. Only give it when it helps, not in every message.`,
    s.office_hours ? `- Office hours: ${s.office_hours}.` : '',
    s.website_url ? `- Website: ${s.website_url}` : '',
    '- Set handoff=true (and reply briefly that the agent will reach out) when they: want to buy or start a policy, ask detailed coverage or claims questions, are upset or complain, want a human, mention a claim or accident needing help, or ask anything you are not sure about.',
    '- If they say they are not interested, already bought, or wrong number: reply once politely, set handoff=true, and do not try to change their mind.',
    '- If their message needs no answer (e.g. "ok", "thanks", "👍"), return an empty reply.',
    '- Only use facts from the lead details below or the agency notes. Never make things up.',
    s.bot_instructions?.trim() ? `\nAgency notes and instructions (follow these):\n${s.bot_instructions.trim()}` : '',
    '',
    'Lead details from their quote request:',
    ...leadSummaryLines(lead),
  ]
    .filter((l) => l !== '')
    .join('\n')
}

/** Decide on a reply to the lead's latest text, given the conversation so far */
export async function botReply(lead: InsuranceLead, history: SmsRow[], s: Settings): Promise<BotDecision> {
  // The conversation, oldest first: our texts as "assistant", theirs as "user"
  const messages: Anthropic.Beta.BetaMessageParam[] = []
  for (const m of history.slice(-30)) {
    const role = m.direction === 'in' ? 'user' : 'assistant'
    const content = m.direction === 'out' && m.sender === 'agent' ? `[sent by the agent personally] ${m.body}` : m.body
    const last = messages[messages.length - 1]
    if (last && last.role === role && typeof last.content === 'string') last.content += `\n${content}`
    else messages.push({ role, content })
  }
  // Must start with the lead and end with the lead
  while (messages.length && messages[0].role !== 'user') messages.shift()
  if (!messages.length || messages[messages.length - 1].role !== 'user') return { reply: '', handoff: false, note: '' }

  const raw = await askClaude({ system: systemPrompt(lead, s), messages, schema: SCHEMA as unknown as Record<string, unknown> })
  const parsed = JSON.parse(raw) as BotDecision
  let reply = String(parsed.reply ?? '').trim()
  if (reply.length > 480) reply = `${reply.slice(0, 477).replace(/\s+\S*$/, '')}...`
  return { reply, handoff: !!parsed.handoff, note: String(parsed.note ?? '').trim() }
}
