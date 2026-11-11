import 'server-only'
import Anthropic from '@anthropic-ai/sdk'

// AI (Claude) - writes chatbot replies and helps write texts.
// Set ANTHROPIC_API_KEY in Vercel. AI_MODEL changes the model (default
// claude-opus-5-5; claude-haiku-5-5 is much cheaper if cost matters more).
export const AI_MODEL = process.env.AI_MODEL || 'claude-opus-5-5'

let client: Anthropic | null = null
function anthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('AI is not set up - add ANTHROPIC_API_KEY in Vercel (see docs/SETUP.md).')
  if (!client) client = new Anthropic({ timeout: 25_000, maxRetries: 1 })
  return client
}

export function aiConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY
}

const supportsServerFallback = (model: string) => /^claude-(opus-5-5|opus-5|sonnet-5-5|fable-5)/.test(model)

/**
 * One request to Claude. With `schema`, the answer is JSON matching it.
 * Returns the text (or JSON text).
 */
export async function askClaude({
  system,
  messages,
  schema,
  maxTokens = 4000,
}: {
  system: string
  messages: Anthropic.Beta.BetaMessageParam[]
  schema?: Record<string, unknown>
  maxTokens?: number
}): Promise<string> {
  const fallback = supportsServerFallback(AI_MODEL)
  const response = await anthropic().beta.messages.create({
    model: AI_MODEL,
    max_tokens: maxTokens,
    system,
    messages,
    output_config: { effort: 'low', ...(schema ? { format: { type: 'json_schema', schema } } : {}) },
    ...(fallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
  })
  if (response.stop_reason === 'refusal') throw new Error('The AI declined to answer this one.')
  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim()
  if (!text) throw new Error('The AI sent back an empty answer.')
  return text
}
