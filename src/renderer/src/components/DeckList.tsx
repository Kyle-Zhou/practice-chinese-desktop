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

function hskLevel(deckName: string): number | null {
  const match = /^HSK (\d+)$/.exec(deckName)
  return match ? Number(match[1]) : null
}

function Sparkle({ x, y, size }: { x: number; y: number; size: number }): React.JSX.Element {
  const d =
    `M${x} ${y - size} L${x + size * 0.3} ${y - size * 0.3} L${x + size} ${y} ` +
    `L${x + size * 0.3} ${y + size * 0.3} L${x} ${y + size} L${x - size * 0.3} ${y + size * 0.3} ` +
    `L${x - size} ${y} L${x - size * 0.3} ${y - size * 0.3} Z`
  return <path d={d} fill="currentColor" />
}

// One sparkle per level — the sprinkle count doubles as a quiet nod to "how far in" this level
// is. Drawn in currentColor at a fixed tilt so .deck-tile-art's CSS is the only place that sets
// the actual ink tint/opacity, matching the level number rather than a real vocabulary word:
// it's decoration, and the number is the one character every learner already recognizes.
const LEVEL_SPARKLES: Record<number, { x: number; y: number; size: number }[]> = {
  1: [{ x: 165, y: 20, size: 10 }],
  2: [
    { x: 150, y: 18, size: 9 },
    { x: 176, y: 36, size: 7 }
  ],
  3: [
    { x: 150, y: 16, size: 9 },
    { x: 176, y: 32, size: 7 },
    { x: 158, y: 122, size: 8 }
  ],
  4: [
    { x: 18, y: 18, size: 8 },
    { x: 182, y: 18, size: 8 },
    { x: 18, y: 120, size: 7 },
    { x: 182, y: 120, size: 7 }
  ]
}

function HskNumeralArt({ level }: { level: number }): React.JSX.Element {
  return (
    <svg viewBox="0 0 200 150" aria-hidden="true">
      <g transform="rotate(-6 100 75)">
        {level === 1 && <rect x="35" y="68" width="130" height="16" rx="8" fill="currentColor" />}
        {level === 2 && (
          <>
            <rect x="55" y="48" width="95" height="14" rx="7" fill="currentColor" />
            <rect x="35" y="86" width="130" height="14" rx="7" fill="currentColor" />
          </>
        )}
        {level === 3 && (
          <>
            <rect x="45" y="38" width="115" height="13" rx="6.5" fill="currentColor" />
            <rect x="58" y="67" width="88" height="13" rx="6.5" fill="currentColor" />
            <rect x="40" y="96" width="122" height="13" rx="6.5" fill="currentColor" />
          </>
        )}
        {level === 4 && (
          <>
            <rect x="42" y="28" width="120" height="100" rx="18" fill="none" stroke="currentColor" strokeWidth="13" />
            <path d="M80 54 v24 q0 12 9 12" fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round" />
            <path d="M124 54 v24 q0 12 -9 12" fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round" />
          </>
        )}
        {(LEVEL_SPARKLES[level] ?? []).map((s, i) => (
          <Sparkle key={i} {...s} />
        ))}
      </g>
    </svg>
  )
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
                  className={`deck-tile deck-tile--level-${level} ${variant}`}
                  onClick={() => (deck.dueCount > 0 ? onStudy(deck.id) : onManage(deck.id))}
                >
                  <div className={`deck-tile-art deck-tile-art--level-${level}`}>
                    <HskNumeralArt level={level} />
                  </div>
                  <div className="deck-tile-content">
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
                  </div>
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
