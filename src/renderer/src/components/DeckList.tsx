import { useEffect, useState } from 'react'
import type { Deck, LessonSummary } from '@shared/types'

interface Props {
  onStudy: (deckId: number | null) => void
  onManage: (deckId: number) => void
  onLearn: () => void
}

export default function DeckList({ onStudy, onManage, onLearn }: Props): React.JSX.Element {
  const [decks, setDecks] = useState<Deck[]>([])
  const [allDueCount, setAllDueCount] = useState(0)
  const [lessons, setLessons] = useState<LessonSummary[]>([])
  const [newDeckName, setNewDeckName] = useState('')
  const [loading, setLoading] = useState(true)

  async function refresh(): Promise<void> {
    const [deckList, dueCount, lessonList] = await Promise.all([
      window.api.decks.list(),
      window.api.decks.allDueCount(),
      window.api.lessons.list()
    ])
    setDecks(deckList)
    setAllDueCount(dueCount)
    setLessons(lessonList)
    setLoading(false)
  }

  useEffect(() => {
    refresh()
  }, [])

  async function handleCreateDeck(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    const name = newDeckName.trim()
    if (!name) return
    await window.api.decks.create({ name })
    setNewDeckName('')
    await refresh()
  }

  async function handleDelete(id: number, name: string): Promise<void> {
    if (!confirm(`Delete deck "${name}" and all its cards? This can't be undone.`)) return
    await window.api.decks.delete(id)
    await refresh()
  }

  if (loading) return <p>Loading decks…</p>

  const completed = lessons.filter((lesson) => lesson.status === 'completed').length
  const next = lessons.find((lesson) => lesson.status !== 'completed')

  return (
    <div className="deck-list">
      <div className="deck-list-toolbar">
        <button className="btn btn-primary" disabled={allDueCount === 0} onClick={() => onStudy(null)}>
          Study All Decks ({allDueCount} due)
        </button>
      </div>

      {/* Reviews only work once you know some words, so the lesson path gets top billing. */}
      <button className="learn-banner" onClick={onLearn}>
        <span className="learn-banner-text">
          <strong>{next ? `Up next: ${next.name}` : 'Every lesson complete'}</strong>
          <span className="deck-stats">
            {completed} of {lessons.length} lessons done · learn new words, then review them here
          </span>
        </span>
        <span className="learn-banner-go">Learn →</span>
      </button>

      <ul className="deck-cards">
        {decks.map((deck) => (
          <li key={deck.id} className="deck-card">
            <div className="deck-card-info">
              <h3>{deck.name}</h3>
              {deck.description && <p className="deck-description">{deck.description}</p>}
              <p className="deck-stats">
                {deck.cardCount} cards · {deck.dueCount} due
              </p>
            </div>
            <div className="deck-card-actions">
              <button className="btn btn-primary" disabled={deck.dueCount === 0} onClick={() => onStudy(deck.id)}>
                Study
              </button>
              <button className="btn" onClick={() => onManage(deck.id)}>
                Manage
              </button>
              <button className="btn btn-danger" onClick={() => handleDelete(deck.id, deck.name)}>
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>

      <form className="new-deck-form" onSubmit={handleCreateDeck}>
        <input
          type="text"
          placeholder="New deck name…"
          value={newDeckName}
          onChange={(e) => setNewDeckName(e.target.value)}
        />
        <button className="btn" type="submit">
          Create Deck
        </button>
      </form>
    </div>
  )
}
