import Anthropic from '@anthropic-ai/sdk'
import {
  addCard,
  appendTutorTurn,
  completeTutorSession,
  createDeck,
  deckExistsByName,
  getApiKey,
  getCardsForDeck,
  getTutorSession,
  listDecks
} from './db'
import type { Correction, PlanCheckpoint, TutorSession, TutorSummary, TutorTurnResult, VocabCandidate } from '../shared/types'

// The reply and extraction calls fire on every conversational turn, so they're the
// cost/latency-sensitive path — Haiku 4.5 with no thinking/effort overhead. The summary
// call fires once per session, so it's worth spending Sonnet 5 there for better synthesis.
const REPLY_MODEL = 'claude-haiku-4-5'
const EXTRACTION_MODEL = 'claude-haiku-4-5'
const SUMMARY_MODEL = 'claude-sonnet-5'

const VOCAB_DECK_NAME = 'Tutor Vocabulary'

function client(): Anthropic {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('No Anthropic API key configured. Add one in Settings first.')
  return new Anthropic({ apiKey })
}

function remainingCheckpoints(plan: PlanCheckpoint[], completedIds: string[]): PlanCheckpoint[] {
  return plan.filter((c) => !completedIds.includes(c.id))
}

function buildReplySystemPrompt(session: TutorSession): string {
  const completed = session.plan.filter((c) => session.completedCheckpointIds.includes(c.id))
  const remaining = remainingCheckpoints(session.plan, session.completedCheckpointIds)

  return [
    `You are role-playing a Chinese conversation partner for a language learner practicing this scenario: "${session.scenarioName}" — ${session.scenarioDescription}`,
    `Stay fully in character as the other person in this scenario. Reply primarily in natural, everyday Mandarin Chinese appropriate for a learner. Keep replies short (1-3 sentences), like a real back-and-forth conversation, not a lecture.`,
    `Do not explicitly point out the learner's mistakes in your reply — a separate system handles corrections. Just respond naturally as your character would, implicitly modeling correct usage.`,
    remaining.length > 0
      ? `Guide the conversation naturally toward these remaining objectives: ${remaining.map((c) => c.description).join('; ')}.`
      : `All objectives have been covered — wrap up the conversation naturally and warmly.`,
    completed.length > 0 ? `Objectives already covered: ${completed.map((c) => c.description).join('; ')}.` : ''
  ]
    .filter(Boolean)
    .join('\n\n')
}

/**
 * Builds the message list for the reply call with a cache breakpoint on the last message
 * of the *previous* turn. Everything up to that point is a stable, repeated prefix across
 * a long conversation; only the newest user message is genuinely new each call. Without
 * this, a 30-minute/60-turn voice session resends the entire growing history at full price
 * on every single turn.
 */
function toCachedMessageParams(transcript: TutorSession['transcript'], newUserMessage: string): Anthropic.MessageParam[] {
  const history: Anthropic.MessageParam[] = transcript.map((m) => ({ role: m.role, content: m.text }))
  const messages: Anthropic.MessageParam[] = [...history, { role: 'user', content: newUserMessage }]

  if (history.length > 0) {
    const lastHistoryIndex = history.length - 1
    const target = history[lastHistoryIndex]
    messages[lastHistoryIndex] = {
      role: target.role,
      content: [
        {
          type: 'text',
          text: target.content as string,
          cache_control: { type: 'ephemeral' }
        }
      ]
    }
  }

  return messages
}

/** Streams the in-character reply, invoking onChunk with each text delta, and returns the full text. */
export async function streamReply(
  session: TutorSession,
  userMessage: string,
  onChunk: (text: string) => void
): Promise<string> {
  const anthropic = client()

  const stream = anthropic.messages.stream({
    model: REPLY_MODEL,
    max_tokens: 512,
    system: [
      {
        type: 'text',
        text: buildReplySystemPrompt(session),
        cache_control: { type: 'ephemeral' }
      }
    ],
    messages: toCachedMessageParams(session.transcript, userMessage)
  })

  stream.on('text', (delta) => onChunk(delta))
  const final = await stream.finalMessage()
  const textBlock = final.content.find((b): b is Anthropic.TextBlock => b.type === 'text')
  return textBlock?.text ?? ''
}

interface ExtractionResult {
  corrections: Correction[]
  completedCheckpointIds: string[]
  newVocab: VocabCandidate[]
}

const EXTRACTION_TOOL: Anthropic.Tool = {
  name: 'extract_turn_data',
  description: 'Report corrections, completed objectives, and new vocabulary found in this tutoring exchange.',
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
        description: 'IDs of scenario objectives (from the provided list, excluding already-completed ones) meaningfully addressed by this exchange.',
        items: { type: 'string' }
      },
      newVocab: {
        type: 'array',
        description: 'Genuinely useful new vocabulary words/phrases from this exchange worth flashcarding. Exclude trivial particles (的/了/吗/呢 etc).',
        items: {
          type: 'object',
          properties: {
            hanzi: { type: 'string' },
            pinyin: { type: 'string' },
            english: { type: 'string' }
          },
          required: ['hanzi', 'pinyin', 'english'],
          additionalProperties: false
        }
      }
    },
    required: ['corrections', 'completedCheckpointIds', 'newVocab'],
    additionalProperties: false
  }
}

/** The plan/objectives portion is identical across an entire session (except when a
 * checkpoint completes), so it's cached separately from the per-turn exchange text. */
function buildExtractionSystemPrompt(session: TutorSession): string {
  return [
    `You are analyzing one exchange from a Chinese-language tutoring conversation for the scenario "${session.scenarioName}".`,
    `Scenario objectives (id: description):\n${session.plan.map((c) => `- ${c.id}: ${c.description}`).join('\n')}`,
    `Objectives already marked complete: ${session.completedCheckpointIds.join(', ') || 'none'}.`,
    `Use the extract_turn_data tool to report mistakes in the learner's Chinese, which remaining objective ids this exchange addressed, and any new vocabulary worth flashcarding.`
  ].join('\n\n')
}

async function extractTurnData(
  session: TutorSession,
  userMessage: string,
  assistantReply: string
): Promise<ExtractionResult> {
  const anthropic = client()
  const response = await anthropic.messages.create({
    model: EXTRACTION_MODEL,
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text: buildExtractionSystemPrompt(session),
        cache_control: { type: 'ephemeral' }
      }
    ],
    messages: [{ role: 'user', content: `Learner said: ${userMessage}\n\nTutor replied: ${assistantReply}` }],
    tools: [EXTRACTION_TOOL],
    tool_choice: { type: 'tool', name: 'extract_turn_data' }
  })

  const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
  if (!toolUse) return { corrections: [], completedCheckpointIds: [], newVocab: [] }
  return toolUse.input as ExtractionResult
}

function commitVocab(candidates: VocabCandidate[]): VocabCandidate[] {
  if (candidates.length === 0) return []

  if (!deckExistsByName(VOCAB_DECK_NAME)) {
    createDeck({ name: VOCAB_DECK_NAME, description: 'Vocabulary encountered while practicing with the AI Tutor' })
  }
  const deck = listDecks().find((d) => d.name === VOCAB_DECK_NAME)
  if (!deck) return []

  const existingHanzi = new Set(getCardsForDeck(deck.id).map((c) => c.hanzi))
  const added: VocabCandidate[] = []
  for (const candidate of candidates) {
    if (existingHanzi.has(candidate.hanzi)) continue
    addCard({ deckId: deck.id, hanzi: candidate.hanzi, pinyin: candidate.pinyin, english: candidate.english })
    existingHanzi.add(candidate.hanzi)
    added.push(candidate)
  }
  return added
}

export async function processTurn(
  sessionId: number,
  userMessage: string,
  onChunk: (text: string) => void
): Promise<TutorTurnResult> {
  const session = getTutorSession(sessionId)
  const reply = await streamReply(session, userMessage, onChunk)
  const extraction = await extractTurnData(session, userMessage, reply)
  const vocabAdded = commitVocab(extraction.newVocab)

  const updated = appendTutorTurn(
    sessionId,
    userMessage,
    reply,
    extraction.corrections,
    extraction.completedCheckpointIds
  )
  const progressPercent =
    updated.plan.length === 0 ? 100 : Math.round((updated.completedCheckpointIds.length / updated.plan.length) * 100)

  return {
    reply,
    corrections: extraction.corrections,
    completedCheckpointIds: extraction.completedCheckpointIds,
    vocabAdded,
    progressPercent
  }
}

const SUMMARY_TOOL: Anthropic.Tool = {
  name: 'session_summary',
  description: 'Report the tutoring session summary.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      keyMistakes: { type: 'array', items: { type: 'string' }, description: '2-5 recurring mistake patterns' },
      learnings: { type: 'array', items: { type: 'string' }, description: '2-4 things the learner did well or learned' }
    },
    required: ['keyMistakes', 'learnings'],
    additionalProperties: false
  }
}

export async function generateSummary(sessionId: number, vocabAddedCount: number): Promise<TutorSummary> {
  const session = getTutorSession(sessionId)
  completeTutorSession(sessionId)

  if (session.corrections.length === 0) {
    return {
      keyMistakes: [],
      learnings: ['No mistakes were flagged this session — nice work!'],
      vocabAddedCount
    }
  }

  const anthropic = client()
  const response = await anthropic.messages.create({
    model: SUMMARY_MODEL,
    max_tokens: 1024,
    thinking: { type: 'disabled' },
    output_config: { effort: 'low' },
    system: 'You are summarizing a completed Chinese language tutoring session for the learner. Be encouraging but honest.',
    messages: [
      {
        role: 'user',
        content: `Corrections made during this session:\n${session.corrections
          .map((c) => `- "${c.mistake}" -> "${c.correction}" (${c.explanation})`)
          .join('\n')}\n\nUse the session_summary tool to report the key recurring mistake patterns and key learnings.`
      }
    ],
    tools: [SUMMARY_TOOL],
    tool_choice: { type: 'tool', name: 'session_summary' }
  })

  const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
  const parsed = (toolUse?.input as { keyMistakes: string[]; learnings: string[] }) ?? {
    keyMistakes: [],
    learnings: []
  }
  return { ...parsed, vocabAddedCount }
}
