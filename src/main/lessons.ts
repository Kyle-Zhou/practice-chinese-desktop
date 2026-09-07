import { addCard, cardExistsInDeck, ensureDeck, getLesson, markLessonCompleted } from './db'
import type { LessonCompletion, LessonResultInput, VocabCandidate } from '../shared/types'

export const PROGRESS_DECK_NAME = 'My Words'
const PROGRESS_DECK_DESCRIPTION = 'Words you have learned in lessons, plus anything you add yourself'

export function ensureProgressDeck(): number {
  return ensureDeck(PROGRESS_DECK_NAME, PROGRESS_DECK_DESCRIPTION).id
}

/**
 * Records the quiz result and files the lesson's words into the progress deck as new SM-2
 * cards, due immediately — so the loop is "do a lesson, then review it".
 *
 * Dedupe is scoped to the progress deck, not global like the tutor's (see commitVocab): every
 * lesson word also lives in a seeded HSK deck, so a cross-deck check would leave "My Words"
 * permanently empty. Overlapping with an HSK deck is the intended trade.
 */
export function completeLesson(lessonId: string, result: LessonResultInput): LessonCompletion {
  const lesson = getLesson(lessonId)
  if (!lesson) throw new Error(`Unknown lesson ${lessonId}`)

  const deckId = ensureProgressDeck()
  const added: VocabCandidate[] = []
  let alreadyInDeck = 0

  for (const word of lesson.words) {
    if (cardExistsInDeck(deckId, word.hanzi)) {
      alreadyInDeck++
      continue
    }
    addCard({ deckId, hanzi: word.hanzi, pinyin: word.pinyin, english: word.english })
    added.push({ hanzi: word.hanzi, pinyin: word.pinyin, english: word.english })
  }

  markLessonCompleted(lessonId, result.correct, result.total)
  return { added, alreadyInDeck, deckId, deckName: PROGRESS_DECK_NAME }
}
