import { useEffect, useState } from 'react'
import type { Deck } from '@shared/types'

interface Props {
  onStudy: (deckId: number | null) => void
  onManage: (deckId: number) => void
}

export default function DeckList({ onStudy, onManage }: Props): React.JSX.Element {
  const [decks, setDecks] = useState<Deck[]>([])
  const [allDueCount, setAllDueCount] = useState(0)
  const [newDeckName, setNewDeckName] = useState('')
  const [loading, setLoading] = useState(true)

  async function refresh(): Promise<void> {
    const [deckList, dueCount] = await Promise.all([window.api.decks.list(), window.api.decks.allDueCount()])
    setDecks(deckList)
    setAllDueCount(dueCount)
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

  return (
    <div className="deck-list">
      <div className="deck-list-toolbar">
        <button className="btn btn-primary" disabled={allDueCount === 0} onClick={() => onStudy(null)}>
          Study All Decks ({allDueCount} due)
        </button>
      </div>

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
