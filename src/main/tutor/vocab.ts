import { addCard, cardExistsWithHanzi, ensureDeck } from '../db'
import type { VocabCandidate } from '../../shared/types'

export const VOCAB_DECK_NAME = 'Tutor Vocabulary'

/**
 * Adds candidates to the tutor deck, skipping anything the learner already has a card
 * for in *any* deck (an HSK word they're already studying is not "new vocabulary").
 * Returns only the cards that were actually created.
 */
export function commitVocab(candidates: VocabCandidate[]): VocabCandidate[] {
  if (candidates.length === 0) return []
  const deck = ensureDeck(VOCAB_DECK_NAME, 'Vocabulary encountered while practicing with the AI Tutor')

  const added: VocabCandidate[] = []
  const seen = new Set<string>()
  for (const candidate of candidates) {
    const hanzi = candidate.hanzi.trim()
    if (!hanzi || seen.has(hanzi) || cardExistsWithHanzi(hanzi)) continue
    seen.add(hanzi)
    addCard({ deckId: deck.id, hanzi, pinyin: candidate.pinyin.trim(), english: candidate.english.trim() })
    added.push({ ...candidate, hanzi })
  }
  return added
}
