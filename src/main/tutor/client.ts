import Anthropic from '@anthropic-ai/sdk'
import { getSecret, getSettings } from '../settings'
import type { ReplyModelTier } from '../../shared/types'

// The reply and analysis calls fire on every conversational turn, so they're the
// cost/latency-sensitive path: Haiku 4.5 by default with no thinking overhead. The learner
// can opt into Sonnet 5 for replies (better free-form tutoring at ~2x the per-turn cost).
// The summary and theme-design calls fire once, so they always use Sonnet 5.
const MODELS: Record<ReplyModelTier, string> = { fast: 'claude-haiku-4-5', smart: 'claude-sonnet-5' }
export const ANALYSIS_MODEL = 'claude-haiku-4-5'
export const SUMMARY_MODEL = 'claude-sonnet-5'
export const DESIGN_MODEL = 'claude-sonnet-5'

export function replyModel(): string {
  return MODELS[getSettings().replyModel]
}

/**
 * Sonnet 5 runs adaptive thinking by default, which adds seconds before the first token.
 * For a spoken reply we want the model to just talk, so thinking is disabled and effort
 * is low. Haiku 4.5 rejects `output_config.effort`, so it gets neither parameter.
 */
export function lowLatencyOptions(model: string): Pick<Anthropic.MessageCreateParams, 'thinking' | 'output_config'> {
  return model.startsWith('claude-sonnet-5') ? { thinking: { type: 'disabled' }, output_config: { effort: 'low' } } : {}
}

let cached: { apiKey: string; client: Anthropic } | null = null

/** Reuses one SDK client per API key so connections are pooled across turns. */
export function anthropicClient(): Anthropic {
  const apiKey = getSecret('anthropic')
  if (!apiKey) throw new Error('No Anthropic API key configured. Add one in Settings first.')
  if (cached?.apiKey !== apiKey) cached = { apiKey, client: new Anthropic({ apiKey }) }
  return cached.client
}

/** Pulls the input of the first tool_use block out of a response, or null if the model didn't call the tool. */
export function toolInput<T>(response: Anthropic.Message): T | null {
  const block = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
  return block ? (block.input as T) : null
}
