import { useEffect, useRef, useState } from 'react'
import type { Deck } from '@shared/types'

interface Props {
  onStudy: (deckId: number | null) => void
  onManage: (deckId: number) => void
}

function CheckIcon(): React.JSX.Element {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

function ChevronIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

function PlusIcon(): React.JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

// A single numeral badge per level rather than a real vocabulary character — it's decoration,
// and the level number itself is the one thing every learner already recognizes.
const HSK_LEVEL_BADGE: Record<number, string> = { 1: '一', 2: '二', 3: '三', 4: '四' }

function hskLevel(deckName: string): number | null {
  const match = /^HSK (\d+)$/.exec(deckName)
  return match ? Number(match[1]) : null
}

export default function DeckList({ onStudy, onManage }: Props): React.JSX.Element {
  const [decks, setDecks] = useState<Deck[]>([])
  const [allDueCount, setAllDueCount] = useState(0)
  const [newDeckName, setNewDeckName] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const newDeckInputRef = useRef<HTMLInputElement>(null)

  async function refresh(): Promise<void> {
    const [deckList, dueCount] = await Promise.all([window.api.decks.list(), window.api.decks.allDueCount()])
    setDecks(deckList)
    setAllDueCount(dueCount)
    setLoading(false)
  }

  useEffect(() => {
    refresh()
  }, [])

  useEffect(() => {
    if (showCreateModal) newDeckInputRef.current?.focus()
  }, [showCreateModal])

  function openCreateModal(): void {
    setNewDeckName('')
    setShowCreateModal(true)
  }

  async function handleCreateDeck(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    const name = newDeckName.trim()
    if (!name) return
    await window.api.decks.create({ name })
    setNewDeckName('')
    setShowCreateModal(false)
    await refresh()
  }

  if (loading) return <p>Loading decks…</p>

  const hskDecks = decks.filter((deck) => hskLevel(deck.name) !== null)
  const personalDecks = decks.filter((deck) => hskLevel(deck.name) === null)

  return (
    <div className="deck-list">
      <div className="deck-list-header">
        <h2>Decks</h2>
        <div className="deck-list-header-actions">
          <span className="study-remaining">{allDueCount} due</span>
          <button className="btn btn-primary" disabled={allDueCount === 0} onClick={() => onStudy(null)}>
            Study all decks
          </button>
          <button className="btn btn-icon" onClick={openCreateModal} aria-label="New deck">
            <PlusIcon />
          </button>
        </div>
      </div>

      {hskDecks.length > 0 && (
        <section className="deck-section">
          <h3 className="section-title">HSK decks</h3>
          <div className="deck-grid">
            {hskDecks.map((deck) => {
              const level = hskLevel(deck.name) ?? 0
              const isEmpty = deck.cardCount === 0
              const isCaughtUp = !isEmpty && deck.dueCount === 0
              const variant = isEmpty ? '' : isCaughtUp ? 'deck-tile--done' : 'deck-tile--due'

              return (
                <button
                  key={deck.id}
                  className={`deck-tile ${variant}`}
                  onClick={() => (deck.dueCount > 0 ? onStudy(deck.id) : onManage(deck.id))}
                >
                  <h4>{deck.name}</h4>
                  {isEmpty ? (
                    <p className="deck-stats">No cards yet</p>
                  ) : isCaughtUp ? (
                    <div className="status-row status-row--completed">
                      <CheckIcon /> All caught up
                    </div>
                  ) : (
                    <p className="deck-stats">{deck.dueCount} due</p>
                  )}
                  <span className="deck-tile-badge">{HSK_LEVEL_BADGE[level] ?? level}</span>
                </button>
              )
            })}
          </div>
        </section>
      )}

      <section className="deck-section">
        <h3 className="section-title">Personal decks</h3>
        {personalDecks.length === 0 ? (
          <p className="deck-description">No personal decks yet — tap + above to create one.</p>
        ) : (
          <ul className="deck-cards">
            {personalDecks.map((deck) => {
              const isEmpty = deck.cardCount === 0
              const isCaughtUp = !isEmpty && deck.dueCount === 0
              const variant = isEmpty ? '' : isCaughtUp ? 'deck-card--done' : 'deck-card--due'

              return (
                <li key={deck.id} className={`deck-card ${variant}`}>
                  <div className="deck-card-info">
                    <h3>{deck.name}</h3>
                    {deck.description && <p className="deck-description">{deck.description}</p>}
                    {isEmpty ? (
                      <p className="deck-stats">No cards yet</p>
                    ) : isCaughtUp ? (
                      <div className="status-row status-row--completed">
                        <CheckIcon /> All caught up · {deck.cardCount} card{deck.cardCount === 1 ? '' : 's'}
                      </div>
                    ) : (
                      <p className="deck-stats">
                        {deck.cardCount} cards · {deck.dueCount} due
                      </p>
                    )}
                  </div>
                  <div className="deck-card-actions">
                    {isEmpty && (
                      <button className="btn btn-primary" onClick={() => onManage(deck.id)}>
                        Add cards
                      </button>
                    )}
                    {!isEmpty && !isCaughtUp && (
                      <button className="btn btn-primary" onClick={() => onStudy(deck.id)}>
                        Study
                      </button>
                    )}
                    {!isEmpty && (
                      <button className="chevron-btn" onClick={() => onManage(deck.id)} aria-label={`Manage ${deck.name}`}>
                        <span className="chevron-icon">
                          <ChevronIcon />
                        </span>
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {showCreateModal && (
        <div className="modal-backdrop" onClick={() => setShowCreateModal(false)}>
          <form
            className="modal-panel"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleCreateDeck}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setShowCreateModal(false)
            }}
          >
            <h3>New deck</h3>
            <input
              ref={newDeckInputRef}
              type="text"
              placeholder="Deck name…"
              value={newDeckName}
              onChange={(e) => setNewDeckName(e.target.value)}
            />
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setShowCreateModal(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={!newDeckName.trim()}>
                Create deck
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
