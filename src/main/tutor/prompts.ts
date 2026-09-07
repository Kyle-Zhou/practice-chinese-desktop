import type Anthropic from '@anthropic-ai/sdk'
import { completedCheckpoints, nextCheckpoint, remainingCheckpoints } from '../../shared/plan'
import type { TutorSession } from '../../shared/types'

/**
 * Prompt caching is a prefix match, so the reply system prompt must not change between
 * turns. Everything session-specific but *stable* (scenario, role, the full plan,
 * correction mode) lives here; per-turn progress state is injected into the newest user
 * message instead (see `progressNote`). That keeps the system prompt + conversation
 * history cache hits intact for the whole session even as checkpoints complete.
 */
export function replySystemPrompt(session: TutorSession): string {
  const spoken = `Your replies are read aloud by text-to-speech, so write only what should be spoken: no markdown, no lists, no pinyin, no stage directions. Use full-width Chinese punctuation (。？！) to end sentences.`
  const brevity = `Keep replies short: one to three sentences, like a real back-and-forth conversation, not a lecture. Ask one question at a time so the learner always has something to respond to.`
  const correctionRule =
    session.correctionMode === 'inline'
      ? `The learner wants every mistake corrected. If their last message contains a grammar, word-choice, or word-order error, begin your reply with a brief correction in this exact shape: "你可以说：<corrected sentence>。" (one sentence, no English), then continue the conversation. If there is no mistake, do not mention corrections at all.`
      : `Do not point out the learner's mistakes in your reply; a separate system tracks corrections. Respond naturally, implicitly modeling correct usage by recasting what they said correctly.`
  const stateNote = `Each learner message ends with a bracketed tutor-state note. Never mention or repeat that note; it is not something the learner said.`

  if (session.scenarioKind === 'conversation') {
    const goals = session.plan.map((c) => `- ${c.description}`).join('\n')
    return [
      `You are 小李, a warm, patient Mandarin tutor having a relaxed spoken conversation with a learner, like a phone call with a friend who happens to be a teacher. ${spoken}`,
      `Today's theme: "${session.scenarioName}" — ${session.scenarioDescription}`,
      `Lesson goals to work in naturally, in any order (not a checklist to announce):\n${goals}`,
      `Guardrails, in priority order:`,
      `1. Language. Speak only Mandarin Chinese in simplified characters. Never switch to English, even if the learner does. If the learner speaks English or asks how to say something, give them the Chinese they need in one short sentence and invite them to say it themselves. At most one short English gloss in parentheses per reply, only when a word is clearly beyond them.`,
      `2. Theme. Keep the conversation on the theme and goals. If the learner drifts, follow for at most one exchange, then steer back with a question. If they ask for anything unrelated to practicing Chinese (writing code, homework, news, opinions on unrelated topics), decline in one friendly Chinese sentence and return to the lesson.`,
      `3. Tutor. Adapt to the learner's level: if they struggle, simplify and slow down; if they are fluent, use richer vocabulary and follow-up questions. Model the goal vocabulary and grammar in your own sentences. Encourage, but do not gush.`,
      correctionRule,
      brevity,
      stateNote,
      `When every goal has been covered, wrap up the conversation naturally and warmly, then stop asking questions.`
    ].join('\n\n')
  }

  const plan = session.plan.map((c, i) => `${i + 1}. ${c.description}`).join('\n')
  return [
    `You are a spoken Mandarin conversation partner for a language learner. ${spoken}`,
    `Scenario: "${session.scenarioName}" — ${session.scenarioDescription}`,
    `You play ${session.tutorRole}. Stay fully in character as that person. The learner plays the other side. Speak only Mandarin Chinese in simplified characters; if the learner speaks English, respond in simple Chinese as your character would and gently prompt them to try in Chinese.`,
    `Speak natural, everyday Mandarin at a level a learner can follow. ${brevity}`,
    correctionRule,
    `The conversation follows this plan in order:\n${plan}`,
    `${stateNote} It tells you which step comes next. Steer the conversation toward that step without announcing it. When every step is done, wrap up the conversation naturally and warmly, then stop asking questions.`
  ].join('\n\n')
}

/** Per-turn progress state, appended to the learner's newest message rather than the system prompt. */
export function progressNote(session: TutorSession): string {
  const done = completedCheckpoints(session.plan, session.completedCheckpointIds)
  const remaining = remainingCheckpoints(session.plan, session.completedCheckpointIds)
  const lines: string[] = [
    done.length > 0 ? `Covered: ${done.map((c) => c.description).join('; ')}.` : 'Nothing covered yet.'
  ]
  if (session.scenarioKind === 'conversation') {
    lines.push(
      remaining.length > 0
        ? `Goals still open (bring one in when natural): ${remaining.map((c) => c.description + (c.keyPhrases?.length ? ` [${c.keyPhrases.join(', ')}]` : '')).join('; ')}.`
        : 'All goals covered: wrap up warmly.'
    )
  } else {
    const next = nextCheckpoint(session.plan, session.completedCheckpointIds)
    lines.push(
      next
        ? `Next step to steer toward: ${next.description}${next.keyPhrases?.length ? ` (phrases the learner should try: ${next.keyPhrases.join(', ')})` : ''}.`
        : 'All steps are covered: wrap up warmly.'
    )
  }
  return `[Tutor state: ${lines.join(' ')}]`
}

/** Stand-in user turn used when the tutor speaks first; a fixed string so it caches like any other history. */
export const JOIN_MESSAGE = '(The learner has just joined the call.)'

function openingInstruction(session: TutorSession): string {
  return session.scenarioKind === 'conversation'
    ? `Greet the learner warmly in Chinese, introduce today's theme in one simple sentence, and ask an easy opening question.`
    : `Open the scene in character with a short greeting and a question, as ${session.tutorRole} would.`
}

/**
 * Builds the reply call's message list. The full stored history goes first with a cache
 * breakpoint on its last message, so only the newest user turn is uncached each call.
 * The progress note is attached only to the newest user message and is never persisted,
 * so history bytes stay identical between turns.
 *
 * If the transcript starts with the tutor's opening line, a fixed synthetic user turn is
 * prepended because the API requires the first message to be from the user.
 */
export function replyMessages(session: TutorSession, userMessage: string): Anthropic.MessageParam[] {
  const history: Anthropic.MessageParam[] = session.transcript.map((m) => ({ role: m.role, content: m.text }))
  if (history.length > 0 && history[0].role === 'assistant') history.unshift({ role: 'user', content: JOIN_MESSAGE })
  if (history.length > 0) {
    const last = history[history.length - 1]
    history[history.length - 1] = {
      role: last.role,
      content: [{ type: 'text', text: last.content as string, cache_control: { type: 'ephemeral' } }]
    }
  }
  return [...history, { role: 'user', content: `${userMessage}\n\n${progressNote(session)}` }]
}

/** Message list for the tutor's opening line on an empty transcript. */
export function openingMessages(session: TutorSession): Anthropic.MessageParam[] {
  return [{ role: 'user', content: `${JOIN_MESSAGE}\n\n[Tutor state: ${openingInstruction(session)}]` }]
}

/**
 * The analysis prompt only needs the plan and the correction context; it's shared across
 * every turn of a session so it caches well. Already-completed ids are passed in the
 * per-turn message so the system prompt stays byte-stable.
 */
export function analysisSystemPrompt(session: TutorSession): string {
  const plan = session.plan
    .map((c) => `- ${c.id}: ${c.description}${c.keyPhrases?.length ? ` (e.g. ${c.keyPhrases.join(', ')})` : ''}`)
    .join('\n')
  const context =
    session.scenarioKind === 'conversation'
      ? `You are analyzing one exchange from a free-flowing spoken Mandarin lesson on the theme "${session.scenarioName}" (${session.scenarioDescription}). The tutor is a Mandarin teacher.`
      : `You are analyzing one exchange from a spoken Mandarin role-play for the scenario "${session.scenarioName}" (${session.scenarioDescription}). The tutor plays ${session.tutorRole}.`
  const stepWord = session.scenarioKind === 'conversation' ? 'goal' : 'step'
  return [
    context,
    `The learner's message came from speech recognition, so ignore missing punctuation and obvious transcription artifacts; only flag genuine grammar, word-choice, word-order, or measure-word mistakes.`,
    `Lesson ${stepWord}s (id: description):\n${plan}`,
    `Use the analyze_turn tool to report: mistakes in the learner's Chinese; which not-yet-completed ${stepWord} ids the learner meaningfully addressed with their message (be strict: the learner must actually do it in Chinese, not just be asked about it); which language the learner used; and vocabulary from either speaker that a learner at this level would benefit from flashcarding.`
  ].join('\n\n')
}

export function analysisUserMessage(session: TutorSession, userMessage: string): string {
  const previousReply = [...session.transcript].reverse().find((m) => m.role === 'assistant')
  const remaining = remainingCheckpoints(session.plan, session.completedCheckpointIds)
  return [
    `Still incomplete: ${remaining.map((c) => c.id).join(', ') || 'none'}.`,
    previousReply ? `Tutor previously said: ${previousReply.text}` : "This is the learner's first message.",
    `Learner said: ${userMessage}`
  ].join('\n\n')
}
