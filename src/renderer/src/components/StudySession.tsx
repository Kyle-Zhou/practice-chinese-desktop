import { useEffect, useState } from 'react'
import type { Card, Grade } from '@shared/types'

interface Props {
  deckId: number | null
  onExit: () => void
}

const GRADE_BUTTONS: { grade: Grade; label: string; hint: string }[] = [
  { grade: 'again', label: 'No Idea', hint: 'see it again soon' },
  { grade: 'hard', label: 'Hard', hint: 'shorter interval' },
  { grade: 'good', label: 'Medium', hint: 'normal interval' },
  { grade: 'easy', label: 'Easy', hint: 'longer interval' }
]

export default function StudySession({ deckId, onExit }: Props): React.JSX.Element {
  const [queue, setQueue] = useState<Card[] | null>(null)
  const [flipped, setFlipped] = useState(false)
  const [reviewedCount, setReviewedCount] = useState(0)

  useEffect(() => {
    window.api.study.dueCards(deckId).then(setQueue)
  }, [deckId])

  const current = queue?.[0] ?? null

  async function handleGrade(grade: Grade): Promise<void> {
    if (!current || !queue) return
    const updated = await window.api.study.submitReview(current.id, grade)
    setReviewedCount((n) => n + 1)

    const rest = queue.slice(1)
    const isImmediatelyDueAgain = new Date(updated.dueAt).getTime() <= Date.now()
    setQueue(isImmediatelyDueAgain ? [...rest, updated] : rest)
    setFlipped(false)
  }

  const remaining = queue?.length ?? 0

  if (queue === null) {
    return <p>Loading cards…</p>
  }

  if (!current) {
    return (
      <div className="study-session study-done">
        <h2>All done!</h2>
        <p>You reviewed {reviewedCount} card{reviewedCount === 1 ? '' : 's'}.</p>
        <button className="btn btn-primary" onClick={onExit}>
          Back to decks
        </button>
      </div>
    )
  }

  return (
    <div className="study-session">
      <div className="study-toolbar">
        <button className="btn" onClick={onExit}>
          ← Exit
        </button>
        <span className="study-remaining">{remaining} remaining</span>
      </div>

      <div
        className={`flashcard ${flipped ? 'flipped' : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => setFlipped((f) => !f)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setFlipped((f) => !f)
          }
        }}
      >
        <div className="flashcard-front">
          <span className="hanzi">{current.hanzi}</span>
        </div>
        {flipped && (
          <div className="flashcard-back">
            <p className="pinyin">{current.pinyin}</p>
            <p className="english">{current.english}</p>
            {current.audioPath && (
              <audio controls src={`file://${current.audioPath}`} onClick={(e) => e.stopPropagation()} />
            )}
          </div>
        )}
      </div>

      {!flipped ? (
        <button className="btn btn-primary btn-flip" onClick={() => setFlipped(true)}>
          Show Answer
        </button>
      ) : (
        <div className="grade-buttons">
          {GRADE_BUTTONS.map(({ grade, label, hint }) => (
            <button key={grade} className={`btn btn-grade btn-grade-${grade}`} onClick={() => handleGrade(grade)}>
              <span>{label}</span>
              <small>{hint}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
