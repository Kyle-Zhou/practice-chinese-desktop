import type Anthropic from '@anthropic-ai/sdk'
import { ANALYSIS_MODEL, anthropicClient, toolInput } from './client'
import { analysisSystemPrompt, analysisUserMessage } from './prompts'
import type { TurnAnalysis, TutorSession } from '../../shared/types'

const ANALYSIS_TOOL: Anthropic.Tool = {
  name: 'analyze_turn',
  description: 'Report corrections, completed lesson steps, learner language, and new vocabulary found in this tutoring exchange.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      corrections: {
        type: 'array',
        description: "Mistakes in the LEARNER's Chinese (not the tutor's), if any.",
        items: {
          type: 'object',
          properties: {
            mistake: { type: 'string', description: "The learner's incorrect phrase, verbatim" },
            correction: { type: 'string', description: 'The corrected version' },
            explanation: { type: 'string', description: 'A short English explanation of why' }
          },
          required: ['mistake', 'correction', 'explanation'],
          additionalProperties: false
        }
      },
      completedCheckpointIds: {
        type: 'array',
        description: 'IDs of still-incomplete lesson steps/goals that the learner meaningfully accomplished in Chinese with this message.',
        items: { type: 'string' }
      },
      learnerLanguage: {
        type: 'string',
        enum: ['zh', 'en', 'mixed'],
        description: 'Language the learner used: zh (Chinese, possibly with a proper noun), en (mostly English), mixed.'
      },
      newVocab: {
        type: 'array',
        description:
          'Genuinely useful vocabulary words/phrases from this exchange worth flashcarding. Exclude trivial particles (的/了/吗/呢 etc) and pronouns.',
        items: {
          type: 'object',
          properties: {
            hanzi: { type: 'string' },
            pinyin: { type: 'string', description: 'Tone-marked pinyin with spaces between syllables' },
            english: { type: 'string' }
          },
          required: ['hanzi', 'pinyin', 'english'],
          additionalProperties: false
        }
      }
    },
    required: ['corrections', 'completedCheckpointIds', 'learnerLanguage', 'newVocab'],
    additionalProperties: false
  }
}

export const EMPTY_ANALYSIS: TurnAnalysis = {
  corrections: [],
  completedCheckpointIds: [],
  newVocab: [],
  learnerLanguage: 'zh'
}

/**
 * Runs independently of (and concurrently with) the reply call: it only looks at the
 * learner's message and the tutor's previous reply, so the turn's critical path is
 * max(reply, analysis) rather than their sum.
 */
export async function analyzeTurn(session: TutorSession, userMessage: string): Promise<TurnAnalysis> {
  const response = await anthropicClient().messages.create({
    model: ANALYSIS_MODEL,
    max_tokens: 1024,
    system: [{ type: 'text', text: analysisSystemPrompt(session), cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: analysisUserMessage(session, userMessage) }],
    tools: [ANALYSIS_TOOL],
    tool_choice: { type: 'tool', name: 'analyze_turn' }
  })
  return toolInput<TurnAnalysis>(response) ?? EMPTY_ANALYSIS
}
