import { useEffect, useState } from 'react'
import type { TutorSession } from '@shared/types'

interface Props {
  sessionId: number
  onExit: () => void
}

export default function TutorSummaryView({ sessionId, onExit }: Props): React.JSX.Element {
  const [session, setSession] = useState<TutorSession | null>(null)
  const [showPinyin, setShowPinyin] = useState(true)

  useEffect(() => {
    window.api.tutor.getSession(sessionId).then(setSession)
  }, [sessionId])

  useEffect(() => {
    window.api.settings.get().then((s) => setShowPinyin(s.showPinyin))
  }, [])

  if (!session) return <p>Loading…</p>
  const summary = session.summary
  if (!summary) {
    return (
      <div className="tutor-summary">
        <p>This session hasn’t been summarized yet.</p>
        <button className="btn" onClick={onExit}>
          Back
        </button>
      </div>
    )
  }

  const missed = session.plan.filter((c) => summary.missedCheckpointIds.includes(c.id))

  return (
    <div className="tutor-summary">
      <h2>Session Complete: {session.scenarioName}</h2>

      <div className="settings-card">
        <h3>Plan coverage · {summary.progressPercent}%</h3>
        {missed.length === 0 ? (
          <p className="deck-description">You covered every step of the plan.</p>
        ) : (
          <>
            <p className="deck-description">Steps you didn’t get to (try them next time):</p>
            <ul>
              {missed.map((c) => (
                <li key={c.id}>{c.description}</li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="settings-card">
        <h3>Key Mistakes</h3>
        {summary.keyMistakes.length === 0 ? (
          <p className="deck-description">No recurring mistake patterns — nice work!</p>
        ) : (
          <ul>
            {summary.keyMistakes.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="settings-card">
        <h3>Learnings</h3>
        {summary.learnings.length === 0 ? (
          <p className="deck-description">Nothing to report; the session was very short.</p>
        ) : (
          <ul>
            {summary.learnings.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="settings-card">
        <h3>Vocabulary</h3>
        {summary.vocabAdded.length === 0 ? (
          <p className="deck-description">No new vocabulary was added this session.</p>
        ) : (
          <>
            <p className="deck-description">
              {summary.vocabAdded.length} new card{summary.vocabAdded.length === 1 ? '' : 's'} added to “Tutor
              Vocabulary”:
            </p>
            <ul className="tutor-vocab-list">
              {summary.vocabAdded.map((v, i) => (
                <li key={i}>
                  <span className="hanzi-inline">{v.hanzi}</span> {showPinyin && `${v.pinyin} · `}
                  {v.english}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <button className="btn btn-primary" onClick={onExit}>
        Back to tutor
      </button>
    </div>
  )
}
