import type Anthropic from '@anthropic-ai/sdk'
import { EMPTY_ANALYSIS, analyzeTurn } from './analysis'
import { anthropicClient, lowLatencyOptions, replyModel } from './client'
import { openingMessages, replyMessages, replySystemPrompt } from './prompts'
import { summarizeSession } from './summary'
import { commitVocab } from './vocab'
import {
  appendAssistantMessage,
  appendTutorTurn,
  completeTutorSession,
  createTutorSession,
  getTutorSession
} from '../db'
import { planProgress } from '../../shared/plan'
import { SentenceSplitter } from '../../shared/text'
import type {
  StartSessionInput,
  TurnAnalysis,
  TutorEvent,
  TutorMessage,
  TutorSession,
  TutorSummary,
  TutorTurnResult
} from '../../shared/types'

export { transcribe } from './stt'
export { synthesize } from './tts'
export { createTheme } from './theme'

export type EmitEvent = (event: TutorEvent) => void

export function startSession(input: StartSessionInput): TutorSession {
  return createTutorSession(input.scenarioId, input.correctionMode ?? 'inline')
}

/** Streams a tutor reply, emitting chunks and sentence boundaries, and returns the full text. */
async function streamReply(
  session: TutorSession,
  messages: Anthropic.MessageParam[],
  emit: EmitEvent
): Promise<string> {
  const splitter = new SentenceSplitter()
  const model = replyModel()
  const stream = anthropicClient().messages.stream({
    model,
    max_tokens: 512,
    ...lowLatencyOptions(model),
    system: [{ type: 'text', text: replySystemPrompt(session), cache_control: { type: 'ephemeral' } }],
    messages
  })

  stream.on('text', (delta) => {
    emit({ type: 'chunk', text: delta })
    for (const sentence of splitter.push(delta)) emit({ type: 'sentence', text: sentence })
  })

  const final = await stream.finalMessage()
  const rest = splitter.flush()
  if (rest) emit({ type: 'sentence', text: rest })

  const text = final.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
  emit({ type: 'replyDone', text })
  return text
}

const openingInFlight = new Set<number>()

/**
 * The tutor speaks first on a fresh session, like answering a call. Idempotent: returns
 * the existing transcript if the session already has one or an opening is in progress.
 */
export async function openSession(sessionId: number, emit: EmitEvent): Promise<TutorSession> {
  const session = getTutorSession(sessionId)
  if (session.transcript.length > 0 || openingInFlight.has(sessionId)) return session
  openingInFlight.add(sessionId)
  try {
    const greeting = await streamReply(session, openingMessages(session), emit)
    return appendAssistantMessage(sessionId, greeting)
  } finally {
    openingInFlight.delete(sessionId)
  }
}

/**
 * One conversational turn. The reply stream and the analysis call run concurrently;
 * the reply is what the learner is waiting on (it drives text-to-speech), while
 * corrections/progress/vocab arrive as a separate event whenever analysis finishes.
 * If analysis fails the turn still succeeds with no corrections, so a flaky extraction
 * call never blocks the conversation.
 */
export async function processTurn(
  sessionId: number,
  userMessage: string,
  source: TutorMessage['source'],
  emit: EmitEvent
): Promise<TutorTurnResult> {
  const session = getTutorSession(sessionId)
  if (session.status !== 'active') throw new Error('This session has already ended.')

  const [reply, analysis] = await Promise.all([
    streamReply(session, replyMessages(session, userMessage), emit),
    analyzeTurn(session, userMessage).catch((err: unknown): TurnAnalysis => {
      console.error('Turn analysis failed; continuing without corrections', err)
      return EMPTY_ANALYSIS
    })
  ])

  const vocabAdded = commitVocab(analysis.newVocab)
  const updated = appendTutorTurn(sessionId, {
    userMessage: { role: 'user', text: userMessage, source, language: analysis.learnerLanguage },
    assistantMessage: { role: 'assistant', text: reply },
    corrections: analysis.corrections,
    completedCheckpointIds: analysis.completedCheckpointIds,
    vocabAdded
  })

  const result: TutorTurnResult = {
    reply,
    corrections: analysis.corrections,
    completedCheckpointIds: updated.completedCheckpointIds,
    vocabAdded,
    progressPercent: planProgress(updated.plan, updated.completedCheckpointIds)
  }
  emit({ type: 'analysis', ...result })
  return result
}

/** Ends the session and persists its summary so it can be revisited from the session list. */
export async function endSession(sessionId: number): Promise<TutorSummary> {
  const session = getTutorSession(sessionId)
  if (session.summary) return session.summary
  const summary = await summarizeSession(session)
  completeTutorSession(sessionId, summary)
  return summary
}
