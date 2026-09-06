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

// --- AI Tutor ---

export interface PlanCheckpoint {
  id: string
  description: string
}

export interface Scenario {
  id: number
  name: string
  description: string
  plan: PlanCheckpoint[]
}

export interface Correction {
  mistake: string
  correction: string
  explanation: string
}

export interface VocabCandidate {
  hanzi: string
  pinyin: string
  english: string
}

export interface TutorMessage {
  role: 'user' | 'assistant'
  text: string
}

export interface TutorSession {
  id: number
  scenarioId: number
  scenarioName: string
  scenarioDescription: string
  plan: PlanCheckpoint[]
  completedCheckpointIds: string[]
  transcript: TutorMessage[]
  corrections: Correction[]
  status: 'active' | 'completed'
  createdAt: string
}

export interface TutorTurnResult {
  reply: string
  corrections: Correction[]
  completedCheckpointIds: string[]
  vocabAdded: VocabCandidate[]
  progressPercent: number
}

export interface TutorSummary {
  keyMistakes: string[]
  learnings: string[]
  vocabAddedCount: number
}
