import type Anthropic from '@anthropic-ai/sdk'
import { SUMMARY_MODEL, anthropicClient, toolInput } from './client'
import { planProgress, remainingCheckpoints } from '../../shared/plan'
import type { TutorSession, TutorSummary } from '../../shared/types'

const SUMMARY_TOOL: Anthropic.Tool = {
  name: 'session_summary',
  description: 'Report the tutoring session summary.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      keyMistakes: {
        type: 'array',
        items: { type: 'string' },
        description: '2-5 recurring mistake patterns, each with a concrete example from the session and the fix'
      },
      learnings: {
        type: 'array',
        items: { type: 'string' },
        description: '2-4 things the learner did well or should take away, grounded in the transcript'
      }
    },
    required: ['keyMistakes', 'learnings'],
    additionalProperties: false
  }
}

/** Synthesizes the session into key mistakes + learnings. Deterministic parts (coverage, vocab) need no model call. */
export async function summarizeSession(session: TutorSession): Promise<TutorSummary> {
  const learnerTurns = session.transcript.filter((m) => m.role === 'user')
  const chineseTurns = learnerTurns.filter((m) => (m.language ?? 'zh') === 'zh').length
  const base = {
    missedCheckpointIds: remainingCheckpoints(session.plan, session.completedCheckpointIds).map((c) => c.id),
    vocabAdded: session.vocabAdded,
    progressPercent: planProgress(session.plan, session.completedCheckpointIds),
    chinesePercent: learnerTurns.length === 0 ? 100 : Math.round((chineseTurns / learnerTurns.length) * 100)
  }

  if (learnerTurns.length === 0) {
    return { keyMistakes: [], learnings: [], ...base }
  }

  const transcript = session.transcript.map((m) => `${m.role === 'user' ? 'Learner' : 'Tutor'}: ${m.text}`).join('\n')
  const corrections =
    session.corrections.map((c) => `- "${c.mistake}" -> "${c.correction}" (${c.explanation})`).join('\n') || '(none)'

  const response = await anthropicClient().messages.create({
    model: SUMMARY_MODEL,
    max_tokens: 2048,
    thinking: { type: 'disabled' },
    output_config: { effort: 'low' },
    system:
      'You are summarizing a completed spoken Mandarin tutoring session for the learner. Be encouraging but honest and specific; quote their actual words.',
    messages: [
      {
        role: 'user',
        content: `${session.scenarioKind === 'conversation' ? 'Lesson theme' : 'Role-play scenario'}: ${session.scenarioName}\n\nTranscript:\n${transcript}\n\nCorrections made during the session:\n${corrections}\n\nUse the session_summary tool to report the key recurring mistake patterns and key learnings.`
      }
    ],
    tools: [SUMMARY_TOOL],
    tool_choice: { type: 'tool', name: 'session_summary' }
  })

  const parsed = toolInput<{ keyMistakes: string[]; learnings: string[] }>(response) ?? { keyMistakes: [], learnings: [] }
  return { ...parsed, ...base }
}
