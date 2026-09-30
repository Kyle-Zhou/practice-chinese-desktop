import type Anthropic from '@anthropic-ai/sdk'
import { ANALYSIS_MODEL, anthropicClient } from './client'

const SYSTEM_PROMPT =
  'Translate the Mandarin Chinese text into natural, idiomatic English, as a whole sentence — not a word-by-word gloss. Reply with only the translation: no notes, no quotes, no pinyin.'

/**
 * Sentence-level translation for the voice screen's English caption/annotation. A dictionary
 * gloss per word (the old approach) reads as word salad for anything longer than a single
 * term, so this is a real translation call instead — same fast model as turn analysis, since
 * it fires on the same cadence (once per settled caption, debounced client-side).
 */
export async function translateToEnglish(text: string): Promise<string> {
  const trimmed = text.trim()
  if (!trimmed) return ''
  const response = await anthropicClient().messages.create({
    model: ANALYSIS_MODEL,
    max_tokens: 300,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: trimmed }]
  })
  const block = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text')
  return block?.text.trim() ?? ''
}
