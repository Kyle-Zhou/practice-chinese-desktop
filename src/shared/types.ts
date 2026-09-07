export type Grade = 'again' | 'hard' | 'good' | 'easy'

export interface Deck {
  id: number
  name: string
  description: string | null
  createdAt: string
  cardCount: number
  dueCount: number
}

export interface Card {
  id: number
  deckId: number
  hanzi: string
  pinyin: string
  english: string
  audioPath: string | null
  notes: string | null
  easeFactor: number
  intervalDays: number
  repetitions: number
  dueAt: string
  lastReviewedAt: string | null
  createdAt: string
}

export interface NewCardInput {
  deckId: number
  hanzi: string
  pinyin: string
  english: string
  audioPath?: string | null
  notes?: string | null
}

export interface NewDeckInput {
  name: string
  description?: string | null
}

/** null deckId means "study across all decks" */
export type StudyScope = { deckId: number } | { deckId: null }

// --- Settings ---

export type SecretName = 'anthropic' | 'openai'

export type SttProvider = 'openai' | 'whisper-cli'

/** 'openai' streams gpt-4o-mini-tts audio through Web Audio; 'system' uses the OS voice via speechSynthesis. */
export type TtsProvider = 'openai' | 'system'

/** 'handsFree' listens continuously with voice-activity detection; 'pushToTalk' records while Space/mic is held. */
export type VoiceMode = 'handsFree' | 'pushToTalk'

/** 'fast' = Haiku 4.5 (lowest latency); 'smart' = Sonnet 5 (better free-form tutoring). */
export type ReplyModelTier = 'fast' | 'smart'

export interface AppSettings {
  sttProvider: SttProvider
  /** Path to the whisper.cpp CLI binary (only used when sttProvider === 'whisper-cli'). */
  whisperCliPath: string
  /** Path to a ggml model file for whisper.cpp. */
  whisperModelPath: string
  /** Speak tutor replies aloud in the renderer. */
  autoSpeak: boolean
  ttsProvider: TtsProvider
  /** OpenAI voice name (alloy, ash, coral, echo, fable, nova, onyx, sage, shimmer, verse). */
  ttsVoice: string
  voiceMode: VoiceMode
  replyModel: ReplyModelTier
}

// --- AI Tutor ---

/**
 * One step of a scenario's conversation plan. Checkpoints are ordered; the tutor
 * steers toward the first incomplete one, and session progress is the fraction complete.
 */
export interface PlanCheckpoint {
  id: string
  description: string
  /** Phrases the learner is expected to attempt at this step. Surfaced as hints and in the summary. */
  keyPhrases?: string[]
}

/**
 * 'roleplay': the tutor plays a character and the plan is an ordered checklist.
 * 'conversation': the tutor is a tutor; the plan is a set of unordered lesson goals to work
 * into a free-flowing chat about a theme.
 */
export type ScenarioKind = 'roleplay' | 'conversation'

export interface Scenario {
  id: number
  kind: ScenarioKind
  name: string
  description: string
  /** The role the tutor plays (e.g. "a waiter"). Keeps the reply prompt in character. */
  tutorRole: string
  plan: PlanCheckpoint[]
  /** True for themes the learner created from a free-text prompt (not seeded). */
  custom: boolean
}

/**
 * 'inline': the tutor briefly corrects mistakes in its spoken reply before continuing in character.
 * 'silent': the tutor stays fully in character; corrections only appear in the side panel.
 */
export type CorrectionMode = 'inline' | 'silent'

export interface Correction {
  mistake: string
  correction: string
  explanation: string
  /** Index into the session transcript of the learner message this correction refers to. */
  turnIndex?: number
}

export interface VocabCandidate {
  hanzi: string
  pinyin: string
  english: string
}

export type LearnerLanguage = 'zh' | 'en' | 'mixed'

export interface TutorMessage {
  role: 'user' | 'assistant'
  text: string
  /** How the learner produced this message. Absent for assistant messages. */
  source?: 'voice' | 'text'
  /** Which language the learner used, as judged by the analysis call. Absent for assistant messages. */
  language?: LearnerLanguage
}

export interface TutorSummary {
  keyMistakes: string[]
  learnings: string[]
  /** Checkpoint ids that were never completed, so the learner knows what to retry. */
  missedCheckpointIds: string[]
  vocabAdded: VocabCandidate[]
  progressPercent: number
  /** Share of learner turns spoken in Chinese (0-100), the "stayed in Mandarin" guardrail metric. */
  chinesePercent: number
}

export interface TutorSession {
  id: number
  scenarioId: number
  scenarioKind: ScenarioKind
  scenarioName: string
  scenarioDescription: string
  tutorRole: string
  plan: PlanCheckpoint[]
  completedCheckpointIds: string[]
  transcript: TutorMessage[]
  corrections: Correction[]
  vocabAdded: VocabCandidate[]
  correctionMode: CorrectionMode
  status: 'active' | 'completed'
  summary: TutorSummary | null
  createdAt: string
  updatedAt: string
}

/** Lightweight row for the session picker; avoids shipping full transcripts. */
export interface TutorSessionSummaryRow {
  id: number
  scenarioId: number
  scenarioName: string
  status: 'active' | 'completed'
  progressPercent: number
  turnCount: number
  updatedAt: string
}

export interface StartSessionInput {
  scenarioId: number
  correctionMode?: CorrectionMode
}

/** Structured output of the per-turn analysis call. */
export interface TurnAnalysis {
  corrections: Correction[]
  completedCheckpointIds: string[]
  newVocab: VocabCandidate[]
  learnerLanguage: LearnerLanguage
}

export interface SynthesizeResult {
  /** Encoded audio (MP3) ready for decodeAudioData. */
  audio: ArrayBuffer
  durationMs: number
}

/**
 * Events pushed from main to the renderer during a turn. The reply streams first
 * (chunks + sentence boundaries, so speech can start before the reply finishes);
 * analysis arrives independently once the parallel extraction call completes.
 */
export type TutorEvent =
  | { type: 'chunk'; text: string }
  | { type: 'sentence'; text: string }
  | { type: 'replyDone'; text: string }
  | {
      type: 'analysis'
      corrections: Correction[]
      completedCheckpointIds: string[]
      vocabAdded: VocabCandidate[]
      progressPercent: number
    }

export interface TutorTurnResult {
  reply: string
  /** Corrections found in this turn only. */
  corrections: Correction[]
  /** All checkpoint ids completed so far in the session (not just this turn). */
  completedCheckpointIds: string[]
  vocabAdded: VocabCandidate[]
  progressPercent: number
}

export interface TranscribeResult {
  text: string
  /** Wall-clock milliseconds spent in the STT provider; shown in the UI for tuning. */
  durationMs: number
}

// --- Dictionary ---

/** One CC-CEDICT headword. `pinyin` is the display form with tone marks. */
export interface DictionaryEntry {
  id: number
  simplified: string
  traditional: string
  pinyin: string
  english: string
}

// --- Lessons ---

export interface LessonExample {
  hanzi: string
  pinyin: string
  english: string
}

export interface LessonWord {
  hanzi: string
  pinyin: string
  english: string
  examples: LessonExample[]
}

/** A lesson exactly as it ships in seed/lessons.json. */
export interface LessonRecord {
  id: string
  name: string
  level: number
  order: number
  words: LessonWord[]
}

/**
 * 'locked' and 'available' are derived from where the lesson sits in the sequence;
 * 'in_progress' and 'completed' come from stored progress.
 */
export type LessonStatus = 'locked' | 'available' | 'in_progress' | 'completed'

export interface LessonSummary {
  id: string
  name: string
  level: number
  order: number
  wordCount: number
  status: LessonStatus
  /** Quiz result of the most recent completion, or null if never finished. */
  correct: number | null
  total: number | null
  completedAt: string | null
}

export interface LessonDetail extends LessonSummary {
  words: LessonWord[]
  /** Words from the other lessons at this level, used as quiz distractors. */
  distractorPool: LessonWord[]
}

export interface LessonResultInput {
  correct: number
  total: number
}

export interface LessonCompletion {
  /** Words that became new cards in the progress deck. */
  added: VocabCandidate[]
  /** Words skipped because the progress deck already had them. */
  alreadyInDeck: number
  deckId: number
  deckName: string
}
